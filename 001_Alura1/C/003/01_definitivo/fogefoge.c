#include <stdio.h>
#include <stdlib.h>
#include <locale.h>
#include <conio.h>
#include "fogefoge.h"

MAPA m; //declarou uma struct do tipo mapa de nome m , abaixo ele se refere a ela com m.

void cls(void) { 
	printf("\033[1J\033[H"); 
}

int liberamapa() {
    for(int i = 0; i < m.linhas; i++){
        free(m.matriz[i]);
    }
    free(m.matriz);
}

int alocamapa(){
    m.matriz = malloc(sizeof(char*) * m.linhas);
    for(int i = 0; i < m.linhas; i++){ //percorre as linhas
        m.matriz[i] = malloc(sizeof(char) * (m.colunas + 1)); //+1 por causa do /0 inicial
    } 
}

int lemapa() {
    FILE* f; //variable type pointer to FILE*
    f = fopen("mapa.txt", "r"); //function fopen, r for read
    if(f == 0){
        printf("Erro ao abrir mapa\n"); //if there's no file
        exit(1);
    }

    fscanf(f, "%d  %d", &(m.linhas), &(m.colunas));//ler do arquivo txt e armazenar nas variÃ¡veias

    alocamapa();

    for(int i = 0; i < 5; i++){
        fscanf(f, "%s", m.matriz[i]);
    }

    fclose(f); //fecha o arquivo
}

void imprimemapa(){
	for(int i = 0; i < 5; i++){
      	printf("%s\n", m.matriz[i]);
    }	    	
}

int acabou(){
	return 0;
}

int move(char direcao){
	int x;
	int y;
	
	for(int i = 0; i < m.linhas; i++){       //procura e dá posição ao jogador em linha
		for(int j = 0; j < m.colunas; j++){  //procura e dá a posição do jogador em coluna
			if(m.matriz[i][j] == '@') {
			x = i;  //nomeia a posição x do jogador com a variável i
			y = j;  // idem só que em y
			break;
			}
		}
	}
	
	switch(direcao) {
        case 'a':
            m.matriz[x][y-1] = '@';
            break;
        case 'w':
            m.matriz[x-1][y] = '@';
            break;
        case 's':
            m.matriz[x+1][y] = '@';
            break;
        case 'd':
            m.matriz[x][y+1] = '@';
            break;
    }

    m.matriz[x][y] = '.';
}

int main(){
    lemapa();
    
    do{
    	system("cls");
		imprimemapa();
	
		char comando;
    	scanf(" %c", &comando);
    	move(comando);
	
	}while(!acabou());

	
    liberamapa();
	getch();
 }
