#include <stdio.h>

int main(){
    int number = 0;
    int sum = 0;
    while(number < 100){
        number++;
        printf("%d \n", number);
        sum = sum + number;
    }
    printf("%d \n", sum);
}