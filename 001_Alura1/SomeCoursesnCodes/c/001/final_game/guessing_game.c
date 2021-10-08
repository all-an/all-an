#include <stdio.h>
#include <stdlib.h>
#include <time.h>

int main(){
    printf("*************\n");
    printf("GUESSING GAME\n");
    printf("*************\n");

    int seconds = time(0); //EPOCH number of seconds since 1970
    srand(seconds); //change the seed srand() of rand() function to a random time seed
    int secret_random_number = rand();
    int secretnumber = secret_random_number % 100;   
    //printf("%d \n", secretnumber);
    

    int guess;
    int attempts;
    int level;
    double score = 1000;

    printf("Choose difficult level?\n");
    printf("(1) Easy (2) Medium (3) Hard\n\n");
    printf("Choose: ");

    scanf("%d", &level);

    switch(level) {
        case 1: 
            attempts = 20;
            break;
        case 2:
            attempts = 15;
            break;
        default:
            attempts = 6;
            break;
    }

    for(int i = 1; i <= attempts; i++){        
        //attempts++;
        printf("Attempt number: %d\n", attempts);
        printf("Guess a number ? \n"); 
 
        scanf("%d", &guess); //parameters declared inside function creation //arguments go out this function
        printf("Your guess is: %d \n", guess);

        if ( guess < 0 ){
            printf("Type a number highter than zero.\n");
            //i--;
            continue; //return to the outside block, in this case the for loop
        }

        int rightGuess = (guess == secretnumber);  
        int higherGuess = (guess > secretnumber);

        if(rightGuess){
            printf("Nice, you guessed it right. !\n");
            printf("You got it right in the attempt number: %d \n", attempts);
            break;
        } else if (higherGuess){ 
                printf("You missed, try again. \n");
                printf("Your guess was higher than the secret number.\n");
        } else {
                printf("You missed, try again. \n");
                printf("Your guess was lower than the secret number. \n");           
        }

        double lostScore = (double)(abs(guess - secretnumber)) / 2;
        score = score - lostScore;
        
    }
    printf("Game Over ! \n");
    printf("Score : %.1f", score);
}