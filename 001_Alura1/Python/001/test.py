print("_____________")
print("guessing game")
print("*************")

secret_number = 42
attempts = 3
#round = 1

print("You have ", attempts, " attempts.")

#while(attempts > 0):
for round in range(1, attempts + 1):
    
    print("_____________")
    print("Attempt {}.".format(round))
    
    
    user_input = input("Type a number ")
    try:
        user_input = int(user_input)
        print("Your guess is: ", user_input)

        hit = secret_number == user_input

        greaterThan = user_input > secret_number

        lowerThan = user_input < secret_number

        if(hit):
            print("You're Right !")
            break
        else:
            if(greaterThan):    
                print("Your guess is higher than the secret number!")
            elif(lowerThan):
                print("Your guess is lower than the secret number")

        print("Game Over !")
        attempts -= 1
        round += 1
        # do something
    except ValueError:
        print("input a valid choice please")

    