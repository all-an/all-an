#include <stdio.h>
#include <stdlib.h>

char** map;
int rows;
int columns;

int main(){
    /*
    map[0][0] = '|';
    map[4][9] = '@';
    */
    //printf("%c %c \n", map[0][0], map[4][9] );

    FILE* f; //variable type pointer to FILE*
    f = fopen("map.txt", "r"); //function fopen, r for read
    if(f == 0){
        printf("Error opening map\n"); //if there's no file
        exit(1);
    }

    fscanf(f, "%d  %d", &rows, &columns);//ler do arquivo txt e armazenar nas variáveias
    printf("Lines: %d, Columns: %d.\n", rows, columns);

    map = malloc(sizeof(char*) * rows);
    for(int i = 0; i < rows; i++){ //percorre as linhas
        map[i] = malloc(char) * columnns + 1; //+1 por causa do /0 inicial
    } 


    /*

    //int* v = malloc(4); //declaring a pointer/adress with 4 bytes
    
    //malloc stands for memory allocation
    //char* y = malloc(1); //char just need 1 byte
    //allocation of an array 5 rows and 10 columns 5 * 10 = 50

    //int* y = malloc(sizeof(int) * 50); //when you don't know the size needed to a type use sizeof, this is dinamicaly alloc
    //*v = 10; //if not an array we need the * to initializing the value, anyway an array already is a pointer
    //printf("Integer %d allocated in %d\n\n", *vhere &variable); //&v see the memory adreess, * does not need in arrays
    int** v = malloc(sizeof(int*) * 5); //addressing each line
    for(int i = 0; i < 5; i++){
        v[i] = malloc(sizeof(int) * 10); //addressing each column
    }
    v[0][0] = 10; //initializing pointer place with 10
    v[1][0] = 20; 
    printf("Integer %d allocated in %d\n", v[0][0], &v[0][0]); //&v see the memory adreess
    printf("Integer %d allocated in %d\n", v[1][0], &v[1][0]); //&v see the memory adreess

    for(int i = 0; i < 5; i++){
        free(v[i]);
    }
    free(v);
    */

    for(int i = 0; i < 5; i++){
        fscanf(f, "%s", map[i]);
    }

    for(int i = 0; i < 5; i++){
        printf("%s\n", map[i]);
    }

    fclose(f); //fecha o arquivo
}