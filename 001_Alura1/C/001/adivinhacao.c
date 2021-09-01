#include <stdio.h>

int main(){

    printf("*************\n");
    printf("GUESSING GAME\n");
    printf("*************\n");

    int secretnumber = 42;

    //printf("%d", secretnumber);

    int guess;

    printf("Guess a number ? \n"); 
 
    scanf("%d", &guess); //parameters declared inside function creation //arguments go out this function

    printf("Your guess is: %d", guess);

}