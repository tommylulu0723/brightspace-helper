// 课程助手 Windows 安装程序（.exe）
// 本身只是一个"启动器"：把内置的图形安装向导（PowerShell + WinForms）放到临时文件夹，
// 用隐藏的 PowerShell 打开它。安装、更新、卸载都在那个窗口里完成。
// 构建：sh build.sh（在 Linux 上交叉编译，不需要 Windows）
package main

import (
	_ "embed"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"unsafe"
)

//go:embed scripts/windows-installer.ps1
var installerPS []byte

//go:embed scripts/windows-setup.ps1
var setupPS []byte

//go:embed scripts/windows-uninstall.ps1
var uninstallPS []byte

const createNoWindow = 0x08000000

func messageBox(text, title string) {
	user32 := syscall.NewLazyDLL("user32.dll")
	proc := user32.NewProc("MessageBoxW")
	t, _ := syscall.UTF16PtrFromString(text)
	c, _ := syscall.UTF16PtrFromString(title)
	proc.Call(0, uintptr(unsafe.Pointer(t)), uintptr(unsafe.Pointer(c)), 0x10) // MB_ICONERROR
}

func fail(zh, en string, err error) {
	msg := zh + "\n" + en
	if err != nil {
		msg += "\n\n" + err.Error()
	}
	messageBox(msg, "Course Helper")
	os.Exit(1)
}

func main() {
	dir := filepath.Join(os.TempDir(), "CourseHelperSetup")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		fail("没法写入临时文件夹。", "Couldn't write to the temp folder.", err)
	}
	files := map[string][]byte{
		"windows-installer.ps1": installerPS,
		"windows-setup.ps1":     setupPS,
		"windows-uninstall.ps1": uninstallPS,
	}
	for name, data := range files {
		if err := os.WriteFile(filepath.Join(dir, name), data, 0o644); err != nil {
			fail("没法写入临时文件夹。", "Couldn't write to the temp folder.", err)
		}
	}

	ps := filepath.Join(os.Getenv("SystemRoot"), "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
	if _, err := os.Stat(ps); err != nil {
		ps = "powershell.exe"
	}
	cmd := exec.Command(ps,
		"-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden",
		"-File", filepath.Join(dir, "windows-installer.ps1"),
		"-SetupScript", filepath.Join(dir, "windows-setup.ps1"),
		"-UninstallScript", filepath.Join(dir, "windows-uninstall.ps1"))
	cmd.Dir = dir
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: createNoWindow}
	var stderr strings.Builder
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		detail := strings.TrimSpace(stderr.String())
		if len(detail) > 1500 {
			detail = detail[:1500] + "…"
		}
		if detail == "" {
			detail = err.Error()
		}
		fail("安装程序没能打开（可能被安全软件拦住了）。把这个窗口截图发给开发者。",
			"The installer couldn't start (it may have been blocked by security software). Send a screenshot of this to the developer.",
			errorString(detail))
	}
}

type errorString string

func (e errorString) Error() string { return string(e) }
