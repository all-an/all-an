"""
n=int(input("Enter the number of elements to be inserted: "))
a=[]
for i in range(0,n):
    elem=int(input("Enter element: "))
    a.append(elem)
avg=sum(a)/n
print("Average of elements in the list",round(avg,2))


"""

n = int(input("Entre o número de elementos da lista: "))
a = []
for i in range(0,n):
    elem = int(input("Entre um elemento: "))
    a.append(elem)

media = sum(a) / n
print("A media dos numeros é: ", round( media, 2 ))