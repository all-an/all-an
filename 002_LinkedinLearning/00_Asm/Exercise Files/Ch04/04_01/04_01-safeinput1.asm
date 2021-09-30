; safe input - read standard input up to n characters
;  terminate on newline or n-1 characters for null character
section .data
	newline		equ		0x0a			; Unix newline, /n
	nullchar	equ		0x0				; terminating string character
	STDIN		equ		0				; standard input device
	SYS_read	equ		0				; system call read character

section .bss
	maxchars	resq	1				; storage for input max

section .text
; on input: rdi = input buffer base address
;			rsi = max characters
; on exit: rax = actuall characters typed (minus the null)
	global safe_input
safe_input:
	mov		rbx, rdi				; reassign input buffer
	mov		[maxchars], rsi			; save max character size
si0:	
	mov		r12, 1					; buffer position
si1:
	mov		rsi, rbx				; input char storage
	mov		rdx, 1					; character count
	mov		rdi, STDIN				; from standard input
	mov		rax, SYS_read			; read into rsi (rbx)
	syscall

	cmp		byte [rbx], newline		; is character read newline?
	je		safe_input_exit			; finish, don't store newline
	inc		rbx						; next byte in the buffer
	inc		r12						; up the character count
	cmp		r12, [maxchars]			; check buffer size
	jl		si1						; keep looping if room
									;  otherwise, fall through:
safe_input_exit:
	mov		byte [rbx], nullchar	; cap the string
	mov		rax, r12				; return characters entered
	dec		rax						; minus one for the null char
	ret

; end
