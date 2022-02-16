"""
1) Quais dados
2) Que fazer com os dados
3) Quais as restrições
4) Qual o resultado esperado
5) Qual a sequencia de passos ao resultado
"""

numero = int(input("Digite o número para calcular o fatorial: "))

if (numero > 0):
    fatorial = 1
    for item in range(1,numero + 1):
        print("Operação {} * {}".format(fatorial,item))
        fatorial *= item

print(fatorial)
        
