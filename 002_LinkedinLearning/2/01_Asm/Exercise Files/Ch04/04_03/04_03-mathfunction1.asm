; math functions
section .data
section .bss
section .text
; add two values: rdi = first argument, rsi = second argument
	global add
add:
	add		rdi, rsi				; add the arguments
	mov		rax, rdi				; put into rax for return
	ret

; subtract two values: rdi = first argument, rsi = second argument
	global subtract
subtract:	
	sub		rdi, rsi				; subtract the arguments
	mov		rax, rdi
	ret

; multiply two values: rdi = first argument, rsi = second argument
	global multiply
multiply:
	mov		rax, rdi				; multiplcation happens in rax
	mul		rsi						; multiply by arg. 2
	ret								; result in rax

; divide two values: xmm0 = first argument, xmm1 = second argument
	global divide
divide:
	divss		xmm0, xmm1			; divide and store result in xmm0
	ret

; end
