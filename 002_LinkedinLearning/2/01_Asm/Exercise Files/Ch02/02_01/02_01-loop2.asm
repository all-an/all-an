; loop2 - simple loop written in assembly
section .data
section .bss
section .text
; code
	global _start
_start:
	mov		rax, 0					; initialize loop
loop:
	inc		rax						; rax++
	cmp		rax, 100				; if rax < 100
	jle		loop					; keep looping

	mov		rax, 60					; system exit call
	syscall
; end of _start	
