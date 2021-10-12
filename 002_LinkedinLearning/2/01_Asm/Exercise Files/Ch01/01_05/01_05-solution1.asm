; solution - answer to Chapter 1 challenge
; Read decimal input, add 10, generate output
section .data
	prompt		db		"How old are you? ",0
	result		db		"In 10 years, you will be ",0
	newline		db		10			; newline, \n
	ten			dq		10			; used for multiplication
	size		equ		4			; buffer size
	azero		equ		0x30		; ASCII zero, '0'
	anine		equ		0x39		; ASCII nine, '9'
	nullchar	equ		0x0			; null terminator, \0

	STDIN		equ		0			; standard input device
	STDOUT		equ		1			; standard output device
	SYS_read	equ		0			; system call to read input
	SYS_write	equ		1			; system call to write message
	SYS_exit	equ		60			; system call to terminate program
	EXIT_OK		equ		0			; OK exit status

	TENS		dq		10000		; tens table
				dq		1000
				dq		100
				dq		10
				dq		1

; uninitialized data
section .bss
	input_buf	resb	size		; age input buffer
	age			resq	1			; binary age value
	output_buf	resb	size		; modified age string

; code
section .text
	global _start
_start:

; output the prompt
	mov		rsi, prompt				; prompt string output
	call	print_string

; read input
	mov		rbx, input_buf			; age string storage
	call	input

; translate decimal string to binary
	mov		rsi, input_buf			; where string value is stored
	call	decimal2binary
	cmp		al, 0					; check for bogus input
	jz		start_exit				; bail if so
	add		rax, 10					; add 10 to the value
	mov		[age], rax				; store result

; output the final prompt
	mov		rsi, result				; First part of the string
	call	print_string

; convert the value in 'age' to a string
	mov		rbx, [age]				; value
	mov		rsi, output_buf			; modified string
	call	binary2decimal

; output the age-value string
	mov		rsi, output_buf
	call	print_value				; use this function to strip leading
									;  zeros
; exit program
start_exit:
	mov		rax, SYS_exit			; system exit call
	mov		rdi, EXIT_OK
	syscall

; end of _start

; functions
;--------;
; output a null terminated string in rsi
print_string:
	cmp		byte [rsi], nullchar	; end-of-string test
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
; translate string input at rsi into binary value in rax
; if garbage input, returned value is zero
decimal2binary:
	mov		rax, 0					; initial value
d2b0:
	mov		rbx, 0					; initialize bax
	mov		bl, byte [rsi]			; character, digit

; filter out non-digit values
	cmp		bl, azero
	jl		d2b_exit				; exit on character < '0'
	cmp		bl, anine
	jg		d2b_exit				; exit on character > '9'
	sub		bl, azero				; convert from ASCII to binary
	mul		qword [ten]				; multiply rax by 10
	add		rax, rbx				; add new value
	inc		rsi						; next char
	cmp		byte [rsi], nullchar	; end of string?
	jnz		d2b0					; if not, keep looping
d2b_exit:	
	ret

;--------;
; generate a string at rsi representing the value in rbx
binary2decimal:
	mov		rdi, TENS				; reference comparision table
									; values here are subtracted from
									; rbx to calculate base 10 digits
b2d0:
	xor		al, al					; zero out al; al stores the character
	mov		rcx, [rdi]				; get power of ten
b2d1:
	or		al, al					; clear carry bit (for jb)
	sub		rbx, rcx				; subtract power of ten
	jb		b2d2					; if <0, the count in al is the value
	inc		al						; decimal value++
	jmp		b2d1					; keep subtracting
b2d2:
	add		al, azero				; make al ASCII
	add		rbx, rcx				; recover from last subtraction
	mov		byte [rsi], al			; add character to the string
	inc		rsi						; next string position
	add		rdi, 8					; next value in TENS table
	cmp		rcx, 1					; end of table?
	jnz		b2d0					; loop again if not
	mov		byte [rsi], nullchar	; terminate string
	ret

;--------;
; output a null-terminated string in rsi
; strip any leading '0' characters
print_value:
	cmp		byte [rsi], nullchar	; always check for null char
	je		print_value_exit		; and exit; string empty
	cmp		byte [rsi], azero		; ASCII zero
	jne		pv1						; if the char isn't zero, continue
	inc		rsi						; otherwise, check next character
	jmp		print_value				; keep looping
pv1:								; process the remaining non-zero digits
	cmp		byte [rsi], nullchar	; null char terminator
	je		print_value_exit		; if true, exit
	mov		rdx, 1					; chars to write
	mov		rdi, STDOUT				; standard output
	mov		rax, SYS_write			; write characters
	syscall
	inc		rsi						; next char
	jmp	pv1							; loop until null char

print_value_exit:
	mov		rsi, newline			; newline defined as \n
	mov		rdx, 1					; write 1 char
	mov		rax, SYS_write			; write character
	mov		rdi, STDOUT				; to standard output
	syscall
	ret
; end
