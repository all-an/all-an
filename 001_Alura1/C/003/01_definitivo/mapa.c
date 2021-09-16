#include <stdio.h>
#include <stdlib.h>
#include <locale.h>
#include <conio.h>
#include "fogefoge.h"
#include "mapa.h"

int liberamapa(MAPA* m) {    //ponteiro apontando para m, pode ser passado qualquer mapa futuramente criado
    for(int i = 0; i < m->linhas; i++){ //m->linhas � o mesmo que ((*m).linhas) onde *m � o conte�do do ponteiro
        free(m->matriz[i]);
    }
    free(m->matriz);
}

int alocamapa(MAPA* m){
    m->matriz = malloc(sizeof(char*) * m->linhas);
    for(int i = 0; i < m->linhas; i++){ //percorre as linhas
        m->matriz[i] = malloc(sizeof(char) * (m->colunas + 1)); //+1 por causa do /0 inicial
    } 
}

int lemapa(MAPA* m) {
    FILE* f; //variable type pointer to FILE*
    f = fopen("mapa.txt", "r"); //function fopen, r for read
    if(f == 0){
        printf("Erro ao abrir mapa\n"); //if there's no file
        exit(1);
    }

    fscanf(f, "%d  %d", &(m->linhas), &(m->colunas));//ler do arquivo txt e armazenar nas variáveias

    alocamapa(m);

    for(int i = 0; i < 5; i++){
        fscanf(f, "%s", m->matriz[i]);
    }

    fclose(f); //fecha o arquivo
}

void imprimemapa(MAPA* m){
	for(int i = 0; i < 5; i++){
      	printf("%s\n", m->matriz[i]);
    }	    	
}
