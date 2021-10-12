; greetings: prompt for string input, output
; initialized data
section .data
	prompt		db		"What is your name? ",0
	response	db		"Pleased to meet you, ",0
	newline		db		10
	size		equ		16			; buffer size

	STDIN		equ		0			; standard input device
	STDOUT		equ		1			; standard output device
	SYS_read	equ		0			; system call to read input
	SYS_write	equ		1			; system call to write message
	SYS_exit	equ		60			; system call to terminate program
	EXIT_OK		equ		0			; OK exit status

; uninitialized data	
section .bss
	input_buf	resb	size		; string input buffer

; code	
section	.text
	global _start
_start:

	mov 	rsi, prompt				; output the prompt
	call	print_string

	mov		rbx, input_buf			; read input
	call	input

	mov		rsi, response			; output the response
	call	print_string
	mov		rsi, input_buf			; output their input
	call	print_string
	call	nl_output				; add a newline

	mov		rax, SYS_exit			; exit program
	mov		rdi, EXIT_OK
	syscall

; end of _start

; functions here
;--------;
; output the null-terminated string in rsi
print_string:
	cmp		byte [rsi], 0			; end-of-string test
	je		print_string_exit		; bail on null char
	mov		rdx, 1					; number of characters to write
	mov		rdi, STDOUT				; to standard output
	mov		rax, SYS_write			; Write characters(s)
	syscall
	inc		rsi						; next character
	jmp		print_string			; keep looping

print_string_exit:
	ret

;--------;
; grab standard input in the buffer in rbx
input:
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
	cmp		r12, size				; check buffer size
	jl		read_char				; keep looping if room
									;  otherwise, fall through:
input_exit:
	mov		byte [rbx], 0			; cap the string
	ret

;--------;
; outupt a newline
nl_output:
	mov		rsi, newline			; /n char's location
	mov		rdx, 1					; size to write
	mov		rax, SYS_write			; write character
	mov		rdi, STDOUT				; to standard output
	syscall
	ret

; end
