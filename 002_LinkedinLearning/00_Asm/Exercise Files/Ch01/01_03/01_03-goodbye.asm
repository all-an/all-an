; initialized data here
section .data

msg			db		"Goodbye, cruel world!", 0xa
msglen		equ		$-msg 		            ; string length in bytes
STDOUT		equ		1						; standard output device
SYS_write	equ		1						; write message
SYS_exit	equ		60						; exit program
EXIT_OK		equ		0						; return value

; code goes here
section .text

; The '_start' label identifies the program's entry point for the
; linker for the 'nasm' assembler. If you use 'gcc', the entry point
; is labeled 'main'
global _start
_start:

; send message string to standard output
			mov		rsi, msg				; text address
			mov		rdx, msgln				; string length (error here)
			mov		rdi, STDOUT				; output device
			mov		rax, SYS_write			; rax holds the function
			syscall							; system interrupt
;exit
			mov		rax,SYS_exit			; exit function
			mov		rdi,EXIT_OK				; exit return value
			syscall							; system interrupt
;done
