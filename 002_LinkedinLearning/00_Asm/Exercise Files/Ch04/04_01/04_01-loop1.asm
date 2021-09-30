; loop from 1 to 100, outputting the decimal values
extern printf

section .data
	format		db		"%d",0x0a,0x0		; null-terminated format string

	SYS_exit	equ		60
	EXIT_OK		equ		0

section .bss
section .text
; loop 100 times and output the values
	global main
main:
	mov		rax, 0
s0:
	inc		rax						; loop counter
	push	rax						; save
	mov		rdi, format				; printf format string, arg 1
	mov		rsi, rax				; value to output, arg 2
	mov		rax, 0					; no floating-point registers
	call	printf					; call C library
	pop rax							; retrieve value
	cmp		rax, 100				; loop 100 times
	jl		s0

; exit
	mov		rax, SYS_exit
	mov		rdi, EXIT_OK
	syscall

; end
