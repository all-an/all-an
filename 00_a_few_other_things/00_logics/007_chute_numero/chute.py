import random

valor_aleatorio = random.randint(1,10)

chute = 0

while(chute != valor_aleatorio):
    chute = int(input("Chute um valor: "))
    if(chute > valor_aleatorio):
        print("Chute maior.")
    elif(chute < valor_aleatorio):
        print("Chute menor.")
    else:
        print("Você acertou.")
        break