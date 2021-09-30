; random_range - return a random value in the range of arg1 to arg2
extern rand
section .data
section .bss
	ulimit		resq		1			; upper limit
	llimit		resq		1			; lower limit

section .text
; random_range: rdi = lower limit, rsi = upper limit
	global random_range
random_range:
	mov		[llimit], rdi				; save lower limit
	sub		rsi, rdi					; get offset for upper limit
	inc		rsi							; +1 to make it inclusive
	mov		[ulimit], rsi				; save it

	; call the rand function
	call	rand
	
	; set the upper limit
	div		qword [ulimit]				; divide rax/upperlimit
	; rdx now holds value in the range of 0 to ulimit
	mov		rax, rdx
	; add the lower limit
	add		rax, [llimit]

random_range_exit:
	ret
	
; end
