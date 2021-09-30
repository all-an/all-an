; deal with a value returned from a C function
; declare the getchar() function
extern getchar

section .data
	prompt		db		"Press a key: "
	prompt_len	equ		$-prompt
	newline		db		0x0a

	STDOUT		equ		1
	SYS_write	equ		1
	SYS_exit	equ		60
	EXIT_OK		equ		0

section .bss
	key			resb	1				; character input
	
section .text
; prompt for a character and output it 10 times
	global main							; use main for clang
main:
	; output the prompt
	mov		rsi, prompt
	mov		rdx, prompt_len
	mov		rax, SYS_write
	mov		rdi, STDOUT
	syscall
	
	; read the character
	push	rbp							; save rbp before call
	mov		rbp, rsp
	call	getchar						; fetch a charater from stdin
	pop		rbp
	mov		[key], rax					; returned in rax, saved

	; output the character 10 times
	mov		rcx, 10						; loop 10 times	
main0:
	push	rcx							; save loop count
	mov		rsi, key					; character to write
	mov		rdx, 1						; number of characters
	mov		rax, SYS_write
	mov		rdi, STDOUT
	syscall
	pop		rcx							; retrieve count
	loop	main0

	; output a newline
	mov		rsi, newline
	mov		rdx, 1
	mov		rax, SYS_write
	mov		rdi, STDOUT
	syscall

	; exit
	mov		rax, SYS_exit
	mov		rdi, EXIT_OK
	syscall

; end
