#include <stdio.h>

void opening(int m){
    printf("Multiplication table of %d.", m);
}

int main(){

    int multipl = 2;
    opening(2);

    for(int i = 1; i <= 10; i++){
        printf("%d x %d = %d\n", multipl, i, multipl * i);
    }
}