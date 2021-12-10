# pergunta e afirmação: 0 ou 1 não são Consecutivos de 9 ! (Exemplos 1 e 3 ambíguos) "amigos ?" kkkk
# não me elimine, não te conheço mas já te amo rsrsrsrs 
def maior_sequencia():
    while(True):
        try:
            print("\nAperte CTRL+C para Sair")
            entrada = list(input("\nEntre qualquer sequência de números: "))

            entrada_inteiros = [int(item) for item in entrada]
            sequencias = [] 
            
            for idx,item in enumerate(entrada_inteiros):
                if not idx or item-1 != sequencias[-1][-1]:
                    sequencias.append([item])
                else:
                    sequencias[-1].append(item)
            maior_sequencia = max(sequencias, key=len)

            print("\n Saída: " , int(''.join(str(i) for i in maior_sequencia)))
        except ValueError:
            print("Favor Digitar Um Número !")
maior_sequencia()
