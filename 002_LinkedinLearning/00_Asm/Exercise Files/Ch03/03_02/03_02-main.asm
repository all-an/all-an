; main - output a string five times
; declare the C language function external
extern message
section .data
	SYS_exit	equ		60			; end program
	EXIT_OK		equ		0			; Exit OK status

section .bss
section .text
; use 'main' as the entry point when linking with 'clang'
	global main
main:

	mov		rcx, 5					; loop 5 times
m0:
	push	rcx						; save rcx
	call	message					; call the C function
	pop		rcx						; restore rcx
	loop	m0						; repeat

; program exit
	mov		rax, SYS_exit
	mov		rdi, EXIT_OK
	syscall

; end
