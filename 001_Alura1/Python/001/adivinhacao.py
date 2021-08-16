print("_____________")
print("guessing game")
print("*************")

secret_number = 42

guess = int(input("Type the first guess: "))

print("Your guess is: ", guess)

if(secret_number == guess):
    print("You're Right !")
else:
    print("You miss")

print("Game Over !")