;output - text output functions
; print_strz: print a null character terminated string
; print_string: print a string of a specific length
; newline_out: output a newline (\n)

section .data
	newline		db		10			; \n
	azero		equ		0x30		; ASCII zero character, '0'
	nullchar	equ		0x0			; null character (terminating)

	STDOUT		equ		1			; standard output device
	SYS_write	equ		1			; system call to write charsection .bss

section .bss	
section .text
;--------;
; print_strz - output null character terminated string
;  rdi = base of string
	global print_strz
print_strz:

; prologue
	push	rbp
	mov		rbp, rsp
	push	rdi						; put address into rsi
	pop		rsi

psz0:	
	cmp		byte [rsi], 0			; end-of-string test
	je		print_strz_exit			; bail on null char
	mov		rdx, 1					; number of characters to write
	mov		rdi, STDOUT				; to standard output
	mov		rax, SYS_write			; Write characters(s)
	syscall
	inc		rsi						; next character
	jmp		psz0					; keep looping

print_strz_exit:
; epilogue
	mov		rsp, rbp				
	pop		rbp
	ret

;--------;
; print_string - output string, no newline
;  rdi = base of string
;  rsi = string length

	global print_string
print_string:

; prologue
	push	rbp
	mov		rbp, rsp

; output the string
	push	rdi						; save string
	push	rsi						; save string length
	pop		rdx						; string length in rdx
	pop		rsi						; string address
	mov		rdi, STDOUT				; to standard output
	mov		rax, SYS_write			; system write call
	syscall

; epilogue	
	mov		rsp, rbp
	pop		rbp
	ret

;--------;
; outupt a newline
	global newline_out
newline_out:
; prologue
	push	rbp
	mov		rbp, rsp

	mov		rsi, newline			; /n char's location
	mov		rdx, 1					; size to write
	mov		rax, SYS_write			; write character
	mov		rdi, STDOUT				; to standard output
	syscall

; epilogue
	mov		rsp, rbp
	pop		rbp
	ret

