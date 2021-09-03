#include <stdio.h>

int main(){
    int number1 = 0;
    int number2 = 0;
    printf("Type a number: "); 
    scanf("%d", &number1);
    while(number2 < 10){
        number2++;
        int mult = number1 * number2;
        printf("%d x %d = %d\n", number1, number2, mult);
    }
}