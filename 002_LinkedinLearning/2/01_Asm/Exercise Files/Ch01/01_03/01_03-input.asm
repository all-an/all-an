; input: read a value and loop that many times
; initialized data
section .data
	prompt		db		"Enter a value, 1 to 9999: ",0
	newline		db		10			; \n
	ten			dq		10			; value 10 for multiplication
	size		equ		5			; string size
	azero		equ		0x30		; ASCII zero character, '0'
	anine		equ		0x39		; ASCII nine character, '9'
	nullchar	equ		0x0			; null character (terminating)

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

; uninitialized data/storage
section .bss
	value		resb	size		; string storage
	input_buf	resb	size		; string input storage
									; back in the old days, I would have
									; used the same buffer for both
; code
section .text

; program start, public name
global _start
_start:

; prompt for input
	mov		rsi, prompt				; output the prompt
	call	print_string

; fetch input
	mov		rbx, input_buf
	call	input

; convert string into binary, saved in rax
	mov		rsi, input_buf
	call	decimal2binary
	cmp		rax, 0					; test to see if junk input
	jle		exit					; bail if so

; assign input value and loop
	mov		rcx, rax				; repeat this many times
repeat:
	push	rcx						; save looping value

; convert the value in rbx to a string	
	mov		rbx, rcx				; get looping value for count
	mov		rsi, value
	call	binary2decimal			; convert rbx into decimal at rsi

; output the string	
	mov		rsi, value
	call	print_value				; output buffer
	pop		rcx						; retrieve rcx

	loop	repeat					; continue the loop until rcx==0

; exit	
exit:
	mov		rax, SYS_exit			; all done
	mov		rdi, EXIT_OK
	syscall

; end of _start

; functions here
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
	mov		rax, 0					; initialize value
d2b0:
	mov		rbx, 0					; initialize rbx
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

; end
