
sequenciona = []
sequencinha = []
nova_seq = [len(sequencinha),sequencinha]

#lista = [7,8,4,5,6,9,0,1,2,3]

lista = [2,1,4,5,6,5,7,9,1,3,1,2,3,4,5,6]

for i in range(len(lista) - 1):
    existe_final = lista[-1] == lista[i] + 1
    contem = lista[-1] in sequencinha
    if lista[i] == lista[i + 1] - 1:
        print('NO GAP between indexes %d and %d' % (i, i+1))
        sequencinha.append(lista[i])         
        print("{} adicionado" .format(lista[i]))
    elif lista[i] - 9 == lista[i + 1]:
        sequencinha.append(lista[i])
        print('NO GAP between indexes %d and %d' % (i, i+1))
        print("{} adicionado" .format(lista[i]))
    else:  
        print('GAP between indexes %d and %d' % (i, i+1))      
        sequencinha.append(lista[i])
        #print("{} adicionado" .format(lista[i]))
        sequenciona.append(sequencinha)
        sequencinha = []
        print("Zerando sequencinha")
    if existe_final == True:
        sequencinha.append(lista[-1])
        print("{} adicionado" .format(lista[-1]))
        sequenciona.append(sequencinha)

    
print(sequenciona)
print(sequencinha)

"""
for key in sequenciona:
   print(key)
"""
#print("Largest element is:", max(list1))

