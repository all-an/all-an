#include <stdio.h>

#define ATTEMPTS 5

int main(){

    printf("*************\n");
    printf("GUESSING GAME\n");
    printf("*************\n");

    int secretnumber = 42;

    //printf("%d", secretnumber);

    int guess;

    for( int i = 1; i <= 5; i++){
        printf("Tentativa %d de %d \n", i, ATTEMPTS);

        printf("Guess a number ? \n"); 
 
        scanf("%d", &guess); //parameters declared inside function creation //arguments go out this function

        printf("Your guess is: %d \n", guess);

        int rightGuess = (guess == secretnumber);  

        //printf("Right guess is %d \n", rightGuess);   //print rightGuess 0 or 1 boolean inside the int

        if(rightGuess){
            printf("Nice, you guessed it right. !\n");
            break;
        } else {
            int higherGuess = (guess > secretnumber);
            printf("You missed, try again. \n");
            if(higherGuess){ 
                printf("Your guess was higher than the secret number.\n");
            }
            if(!higherGuess){
                printf("Your guess was lower than the secret number. \n");
            }
        }
    
    }
    printf("Game Over ! \n");

}