#include <stdio.h>

int main(){
    int notas[5];
    for(int i = 0; i < 5; i++) {
        printf("%d \n", notas[i] = i + 2); //atribution in a for
    }
}