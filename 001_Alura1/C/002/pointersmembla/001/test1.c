#include <stdio.h>


void calcula(int* c2){  //ponteiro para um inteiro passado como argumento abaixo c
    
    printf("calcula %d  %d \n", (*c2), c2);
    (*c2)++;
    printf("calcula %d  %d \n", (*c2), c2);
    
}

int main(){

    int c = 10;

    printf("main %d  %d \n", c, &c);
    calcula(&c); //argumento passando apontado para c
    printf("main %d  %d \n", c, &c);
}


/*
void calcula(int c){
    printf("calcula %d  %d \n", c, &c);
    c++;
    printf("calcula %d  %d \n", c, &c);
}

int main(){

    int c = 10;

    printf("main %d  %d \n", c, &c);
    calcula(c);
    printf("main %d  %d \n", c, &c);
}
*/