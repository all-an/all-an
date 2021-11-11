#include <stdio.h>
#include <stdlib.h>
#include <time.h>

//#define ATTEMPTS 5  //constant variable

int main(){

    printf("*************\n");
    printf("GUESSING GAME\n");
    printf("*************\n");

    int seconds = time(0); //EPOCH number of seconds since 1970
    srand(seconds); //change the seed srand() of rand() function to a random time seed
    
    int secret_random_number = rand();

    int secretnumber = secret_random_number % 100;
    
    /*
    //integers
    short bytes = 2;//2 bytes
    int bytes = 4; //4 bytes = 32 bits ~= 2**32 sequence 
    long bytes = 8;//8 bytes = 64 bits ~= 2**64 sequence
    //decimals
    double bytes = 8; //8 bytes , double are more precise than float
    float bytes = 4;
    */

    printf("%d \n", secretnumber);

    int guess;
    int attempts = 0;
    double score = 1000;
    
    //for( int i = 1; i <= ATTEMPTS; i++){
    while(1){    
        
        attempts++;
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

        //printf("Right guess is %d \n", rightGuess);   //print rightGuess 0 or 1 boolean inside the int

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
        
        /*if (lostScore < 0){
            lostScore = -lostScore;
        }*/

        score = score - lostScore;
        
    }
    printf("Game Over ! \n");
    printf("Score : %.1f", score);
}