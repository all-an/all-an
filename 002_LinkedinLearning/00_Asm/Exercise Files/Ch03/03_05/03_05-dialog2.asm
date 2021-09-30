; assembly language dialog functions
section .data
	string1		db		"Assembly: I'm a low-level language",0x0a
	string1_len	equ		$-string1
	string2		db		"Assembly: I'm fast",0x0a
	string2_len	equ		$-string2
	string3		db		"Assembly: My development cycle is long",0x0a
	string3_len	equ		$-string3

	STDOUT		equ		1				; standard output
	SYS_write	equ		1				; write message
	
section .bss

section .text
; first dialog
	global adialog1
adialog1:	
	mov		rsi, string1				; reference the string
	mov		rdx, string1_len			; string's length
	mov		rdi, STDOUT					; to standard output
	mov		rax, SYS_write				; system write call
	syscall								; call the system
	ret
	
; second dialog
	global adialog2
adialog2:	
	mov		rsi, string2
	mov		rdx, string2_len
	mov		rdi, STDOUT
	mov		rax, SYS_write
	syscall
	ret
	
; third dialog
	global adialog3
adialog3:	
	mov		rsi, string3
	mov		rdx, string3_len
	mov		rdi, STDOUT
	mov		rax, SYS_write
	syscall
	ret
	
; end
