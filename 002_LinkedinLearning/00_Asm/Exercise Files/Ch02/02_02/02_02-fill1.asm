; fill - initialize a 1M buffer
section .data
	SYS_exit	equ		60				; system call to terminated
	EXIT_OK		equ		0				; OK exit status
	megabyte	equ		1048576

section .bss
	buffer		resb	megabyte

section .text
	global _start
_start:
	mov		rdi, buffer
	mov		rcx, megabyte				; megabyte
start_loop:
	mov		byte [rdi], 0xaa			; initialize byte
	inc		rdi
	loop	start_loop					

start_exit:
	mov		rax, SYS_exit				;system exit call
	mov		rdi, EXIT_OK
	syscall

;end
