#include <stdio.h>
#include <stdlib.h>
#include <time.h>

int main(){
    int seconds = time(0); //EPOCH number of seconds since 1970
    srand(seconds);

    int n1 = rand() % 100; //last two decimal places
    int n2 = rand() % 100;

    printf("%d e %d\n", n1, n2); 
}