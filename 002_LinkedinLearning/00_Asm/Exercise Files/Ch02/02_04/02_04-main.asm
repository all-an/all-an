; main - test
extern print_strz
extern print_string
extern newline_out
extern input

section .data
	prompt1		db		"Who are you? "
	prompt1_len	equ		$-prompt1
	prompt2		db		"What is your mood? "
	prompt2_len	equ		$-prompt2
	reply1		db		"Hello, ",0
	reply2		db		"Well, ",0
	reply3		db		", I feel ",0
	reply4		db		" too!",0x0a,0x0

	SIZE		equ		32

section .bss
	name		resb	SIZE
	mood		resb	SIZE

section .text
	global _start
_start:

	; first prompt
	mov		rdi, prompt1
	mov		rsi, prompt1_len
	call	print_string

	; first input
	mov		rdi, name
	mov		rsi, SIZE
	call	input
	
	; greetings
	mov		rdi, reply1
	call	print_strz
	mov		rdi, name
	call	print_strz
	call	newline_out

	; second prompt
	mov		rdi, prompt2
	mov		rsi, prompt2_len
	call	print_string

	; second input
	mov		rdi, mood
	mov		rsi, SIZE
	call	input

	; final output string
	mov		rdi, reply2
	call	print_strz
	mov		rdi, name
	call	print_strz
	mov		rdi, reply3
	call	print_strz
	mov		rdi, mood
	call	print_strz
	mov		rdi, reply4
	call	print_strz

; exit
	mov		rax, 60
	syscall

; end
