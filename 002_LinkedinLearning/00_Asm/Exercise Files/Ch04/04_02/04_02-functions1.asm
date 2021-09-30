; just two silly functions that return values
section .data
	ivalue		dq		0xaa				; integer value
	fvalue		dd		3.14159				; floating point value

section .bss

section .text
;--------;
; this function returns an integer value
	global integer
integer:
		mov rax, [ivalue]					; return integers rax
		ret

;--------;
; this function returns a floating point value
	global floating
floating:	
		movss xmm0, dword [fvalue]			; return real numbers in xmm0
		ret
	
; end		
