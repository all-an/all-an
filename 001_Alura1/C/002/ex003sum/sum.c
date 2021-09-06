#include <stdio.h>

int main(){
    int numeros[10];

    printf("Digite 10 numeros:\n");

    int i = 1;

    for(i = 1; i < 10; i++) {
        printf("Numero %d:", i);
        scanf(" %d", &numeros[i]);
    }

    soma(numeros);
}