#include <stdio.h>
#include <stdlib.h>

char** map;
int rows;
int columns;

int freemap() {
    for(int i = 0; i < rows; i++){
        free(map[i]);
    }
    free(map);
}

int allocatemap(){
    map = malloc(sizeof(char*) * rows);
    for(int i = 0; i < rows; i++){ //percorre as linhas
        map[i] = malloc(sizeof(char) * (columns + 1)); //+1 por causa do /0 inicial
    } 
}

int readmap() {
    FILE* f; //variable type pointer to FILE*
    f = fopen("map.txt", "r"); //function fopen, r for read
    if(f == 0){
        printf("Error opening map\n"); //if there's no file
        exit(1);
    }

    fscanf(f, "%d  %d", &rows, &columns);//ler do arquivo txt e armazenar nas variáveias

    allocatemap();

    for(int i = 0; i < 5; i++){
        fscanf(f, "%s", map[i]);
    }

    fclose(f); //fecha o arquivo
}

int main(){
    
    readmap();

    for(int i = 0; i < 5; i++){
        printf("%s\n", map[i]);
    }

    freemap();
 }