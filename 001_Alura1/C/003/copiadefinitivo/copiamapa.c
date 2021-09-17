#include <stdio.h>
#include <stdlib.h>
#include <locale.h>
#include <conio.h>
#include "copiafogefoge.h"
#include "copiamapa.h"

void andanomapa(MAPA* m, int xorigem, int yorigem, int xdestino, int ydestino) {

    char personagem = m->matriz[xorigem][yorigem];
    m->matriz[xdestino][ydestino] = personagem;
    m->matriz[xorigem][yorigem] = '.';

}

int ehvalida(MAPA* m, int x, int y) {
    if(x >= m->linhas) 
        return 0;
    if(y >= m->colunas) 
        return 0;

    return 1;    
}

int ehVazia(MAPA* m, int x, int y) {
    return m->matriz[x][y] == '.';
}

void encontramapa(MAPA* m, POSICAO* p, char c) {

    for(int i = 0; i < m->linhas; i++) {
        for(int j = 0; j < m->colunas; j++) {
            if(m->matriz[i][j] == c) {
                p->x = i;
                p->y = j;
                break;
            }
        }
    }

}

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
    f = fopen("copiamapa.txt", "r"); //function fopen, r for read
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
