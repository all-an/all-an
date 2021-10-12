; message module - output a string
section .data
	string		db		"Oh, no! This line repeats!",0x0a
	string_len	equ		$-string

	STDOUT		equ		1			; standard output device
	SYS_write	equ		1			; system call to write message

section .bss
section .text
	global message
message:	

	mov		rsi, string				; text address
	mov		rdx, string_len			; size
	mov		rdi, STDOUT				; output device
	mov		rax, SYS_write			; write the text
	syscall
	ret

; end
