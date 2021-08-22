import random

print("_____________")
print("guessing game")
print("*************")

secret_number = random.randrange(1, 101)
attempts = 3
#round = 1

print("If an error occur please restart the game. ")
print("Choose a level of difficulty: ")
print("(1) Easy, (2) Medium, (3) Hard")

points = 1000

difficulty = int(input("Type your level of difficulty: "))

if difficulty == 1:
    attempts = 20
elif difficulty == 2:
    attempts = 10
else:
    attempts = 5

#print(secret_number)
print("You have ", attempts, " attempts.")

#while(attempts > 0):
for round in range(1, attempts + 1):
    
    print("_____________")
    print("Attempt {} from {} attempts.".format(round, attempts))
    
    guess = input("Type a number between 1 and 100: ") 

    if(guess.isnumeric()):
        guess = int(guess)
    else:
        print("Restart the game and type a number please !")
        break

    print("Your guess is: ", guess)

    if(guess < 1):
        print("Type a number between 1 and 100")
        continue


    hit = secret_number == guess

    greaterThan = guess > secret_number

    lowerThan = guess < secret_number

    if(hit):
        print("You Win ! Points earned: {}".format(points))
        break
    else:
        if(greaterThan):    
            print("Your guess is higher than the secret number!")
        elif(lowerThan):
            print("Your guess is lower than the secret number")
        lost_points = abs(secret_number - guess)
        points = points - lost_points

    print("Game Over !")
    round += 1
