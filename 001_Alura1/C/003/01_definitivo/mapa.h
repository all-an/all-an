struct mapa {
    char** matriz;
    int linhas;
    int colunas; 
};

typedef struct mapa MAPA; //um tipo de apelido foi definido para a struct do tipo mapa, com o nome de MAPA ele torna mais fácil a definição de ma nova struct tipo map
 
int liberamapa();
int lemapa();
int alocamapa();
void imprimemapa();


