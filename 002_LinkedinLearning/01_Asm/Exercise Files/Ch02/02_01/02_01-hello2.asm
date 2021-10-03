; hello - output "Hello, World" + newline
section .data
	string		db		"Hello, world!",10
	string_len	equ		$ - string

	STDOUT		equ		1			; standard output device
	SYS_write	equ		1			; system call to write char
	SYS_exit	equ		60			; program terminate
	EXIT_OK		equ		0			; exit OK

section .bss
; code start
section .text
	global _start
_start:

; output the string
	mov		rsi, string				; reference the string
	mov		rdx, string_len			; number of characters to write
	mov		rdi, STDOUT				; to standard output
	mov		rax, SYS_write			; system write call
	syscall

; exit
	mov 	rax, SYS_exit			; system exit call
	syscall

; end of _start
