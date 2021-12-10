
while(True):
    print("\nAperte CTRL + C caso queira sair.")
    lista_de_sequencias = []
    sequencinha = []
    entrada = list(input("\nEntre qualquer sequência de números: "))

    try:
        entrada_inteiros = [int(item) for item in entrada]

        sequencias = []
        for idx,item in enumerate(entrada_inteiros):
            if not idx or item-1 != sequencias[-1][-1]:
                sequencias.append([item])
            else:
                sequencias[-1].append(item)
    
        maior_sequencia = max(sequencias, key=len)

        #print(maior_sequencia)

    except ValueError:
        print(">>>>>>>>>>> Isso não é um número ! <<<<<<<<<<<")
    
    #for i in entrada:
    #    print(i, end='')

    
        