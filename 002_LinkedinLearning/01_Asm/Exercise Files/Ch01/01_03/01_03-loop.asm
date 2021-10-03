; initialized data
section .data
	newline		db		10			; \n
	size		equ		5			; string size
	loop_value	equ		100			; number of times to repeat
	azero		equ		0x30		; ASCII zero character, '0'
	nullchar	equ		0x0			; null character (terminating)

	STDOUT		equ		1			; standard output device
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

; code
section .text

; program start, public name
global _start
_start:

	mov		rcx, loop_value			; repeat this many times
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
	mov		rax, SYS_exit			; all done
	mov		rdi, EXIT_OK
	syscall

; end of _start

; functions here
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
