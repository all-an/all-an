#include <stdio.h>
#include <math.h>

void potencia(int* resultado, int a, int b) {
    int resultado = 1;
    for(int i = 0; i < b; i++) {
        *resultado = *resultado * a;
    }

    printf("The result is %d", resultado);
}

int main(){
    int a = 2;
    int b = 3;
    int c = pow(a, b);

    printf("%d to the power of  %d is: %d \n", a, b, c);
    int resultado;
    potencia(&resultado, 2, 3);
}

