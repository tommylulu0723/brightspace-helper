#!/usr/bin/env python3
"""生成 Go 能链接的 Windows 资源文件（.syso）：程序图标 + manifest。
用法：python3 mkrsrc.py icon16.png icon32.png icon48.png icon256.png -o rsrc_windows_amd64.syso
（图标里每个尺寸直接存 PNG，Windows Vista 以后都支持）"""
import struct, sys, argparse
from PIL import Image

MANIFEST = b'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
  <assemblyIdentity version="1.0.0.0" processorArchitecture="*" name="CourseHelper.Setup" type="win32"/>
  <description>Course Helper Setup</description>
  <trustInfo xmlns="urn:schemas-microsoft-com:asm.v3"><security><requestedPrivileges>
    <requestedExecutionLevel level="asInvoker" uiAccess="false"/>
  </requestedPrivileges></security></trustInfo>
  <compatibility xmlns="urn:schemas-microsoft-com:compatibility.v1"><application>
    <supportedOS Id="{8e0f7a12-bfb3-4fe8-b9a5-48fd50a15a9a}"/>
  </application></compatibility>
</assembly>
'''

def build(pngs):
    images = []
    for p in pngs:
        im = Image.open(p)
        images.append((im.size[0], open(p, 'rb').read()))
    # 资源：(type, id, data)
    res = []
    for i, (_, data) in enumerate(images, 1):
        res.append((3, i, data))                       # RT_ICON
    grp = struct.pack('<HHH', 0, 1, len(images))
    for i, (w, data) in enumerate(images, 1):
        b = 0 if w >= 256 else w
        grp += struct.pack('<BBBBHHIH', b, b, 0, 0, 1, 32, len(data), i)
    res.append((14, 1, grp))                           # RT_GROUP_ICON
    res.append((24, 1, MANIFEST))                      # RT_MANIFEST
    return res

def coff(res):
    LANG = 0x0409
    types = sorted(set(t for t, _, _ in res))
    # 目录大小：根目录 + 每种类型一个目录 + 每个资源一个语言目录
    def dirsize(n): return 16 + 8 * n
    off = dirsize(len(types))
    type_dir_off = {}
    for t in types:
        type_dir_off[t] = off
        off += dirsize(sum(1 for x in res if x[0] == t))
    lang_dir_off = {}
    for t in types:
        for (tt, i, _) in res:
            if tt == t:
                lang_dir_off[(t, i)] = off
                off += dirsize(1)
    entry_off = {}
    for t in types:
        for (tt, i, _) in res:
            if tt == t:
                entry_off[(t, i)] = off
                off += 16
    data_off = {}
    for t in types:
        for (tt, i, d) in res:
            if tt == t:
                off = (off + 7) & ~7
                data_off[(t, i)] = off
                off += len(d)
    total = (off + 7) & ~7
    buf = bytearray(total)
    def put_dir(o, entries):
        struct.pack_into('<IIHHHH', buf, o, 0, 0, 0, 0, 0, len(entries))
        for k, (name, target, is_dir) in enumerate(entries):
            struct.pack_into('<II', buf, o + 16 + 8 * k, name, target | (0x80000000 if is_dir else 0))
    put_dir(0, [(t, type_dir_off[t], True) for t in types])
    relocs = []
    for t in types:
        ids = sorted(i for (tt, i, _) in res if tt == t)
        put_dir(type_dir_off[t], [(i, lang_dir_off[(t, i)], True) for i in ids])
        for i in ids:
            put_dir(lang_dir_off[(t, i)], [(LANG, entry_off[(t, i)], False)])
            d = next(dd for (tt, ii, dd) in res if tt == t and ii == i)
            # IMAGE_RESOURCE_DATA_ENTRY：OffsetToData 是 RVA，链接时由重定位填上
            struct.pack_into('<IIII', buf, entry_off[(t, i)], data_off[(t, i)], len(d), 0, 0)
            relocs.append(entry_off[(t, i)])
            buf[data_off[(t, i)]:data_off[(t, i)] + len(d)] = d
    # COFF 文件
    hdr_size = 20 + 40
    raw_ptr = hdr_size
    reloc_ptr = raw_ptr + len(buf)
    sym_ptr = reloc_ptr + 10 * len(relocs)
    out = bytearray()
    out += struct.pack('<HHIIIHH', 0x8664, 1, 0, sym_ptr, 1, 0, 0)
    out += struct.pack('<8sIIIIIIHHI', b'.rsrc\0\0\0', 0, 0, len(buf), raw_ptr, reloc_ptr, 0, len(relocs), 0, 0x40000040)
    out += buf
    for r in relocs:
        out += struct.pack('<IIH', r, 0, 3)            # IMAGE_REL_AMD64_ADDR32NB，相对符号 0（.rsrc 段起点）
    out += struct.pack('<8sIhHBB', b'.rsrc\0\0\0', 0, 1, 0, 3, 0)  # 段符号，STATIC
    out += struct.pack('<I', 4)                        # 空字符串表
    return bytes(out)

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('pngs', nargs='+')
    ap.add_argument('-o', required=True)
    a = ap.parse_args()
    open(a.o, 'wb').write(coff(build(a.pngs)))
