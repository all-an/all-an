def main():
    n = int(input("Digite o valor de n: "))
    fat = 1
    i = 2
    while i <= n:
        print("Operação {} * {}" .format(fat,i))
        fat = fat * i
        i = i + 1

    print("O valor de %d! eh =" %n, fat)

#-----
main()
