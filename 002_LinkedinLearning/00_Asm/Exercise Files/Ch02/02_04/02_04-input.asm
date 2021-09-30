; input routines
; input: grab a string from standard input

section .data
	STDIN		equ		0			; standard input device
	SYS_read	equ		0			; system call to read input

section .bss
	length		resq	1			; input buffer size

section .text
;--------;
; input - grab standard input 
;  rdi = buffer address
;  rsi = input buffer size
	global input
input:
	
; prologue
	push	rbp
	mov		rbp, rsp
	mov		rbx, rdi				; set buffer address
	push	rdi						; save buffer address
	mov		[length], rsi			; save input length

	mov		r12, 1					; buffer position
read_char:
	mov		rsi, rbx				; input char storage
	mov		rdx, 1					; character count
	mov		rdi, STDIN				; from standard input
	mov		rax, SYS_read			; read into rsi (rbx)
	syscall

	cmp		byte [rbx], 10			; is character read newline?
	je		input_exit				; finish, don't store newline
	inc		rbx						; next byte in the buffer
	inc		r12						; up the character count
	cmp		r12, [length]			; check buffer size
	jl		read_char				; keep looping if room
									;  otherwise, fall through:
input_exit:
	mov		byte [rbx], 0			; cap the string

; epilogue
	pop		rax						; retreive buffer address in rax
	mov		rsp, rbp
	pop		rbp
	ret

