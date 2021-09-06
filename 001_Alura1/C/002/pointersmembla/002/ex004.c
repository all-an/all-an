#include <stdlib.h>


int sum(int a, int b){
    int* num = a + b;
    printf("Sum %d + %d = %d", a, b, num);
}

int main(){
    sum(2, 3);
}

/*
void soma(int* num, int a, int b) {
    *num = a + b;
}
*/


