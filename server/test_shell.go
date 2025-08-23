package main

import (
	"fmt"
	"os"
	"os/exec"
)

func main() {
	// Test environment
	fmt.Println("SHELL env var:", os.Getenv("SHELL"))
	fmt.Println("USER env var:", os.Getenv("USER"))

	// Test if /bin/zsh exists
	if _, err := os.Stat("/bin/zsh"); os.IsNotExist(err) {
		fmt.Println("/bin/zsh does not exist")
	} else {
		fmt.Println("/bin/zsh exists")
	}

	// Test exec.Command with /bin/zsh
	cmd := exec.Command("/bin/zsh", "-c", "echo hello")
	output, err := cmd.Output()
	if err != nil {
		fmt.Println("Error executing /bin/zsh:", err)
	} else {
		fmt.Println("/bin/zsh output:", string(output))
	}
}
