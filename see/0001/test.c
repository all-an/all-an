#include <stdio.h>
#include <stdlib.h>

int main(){

    
    typedef struct NO{
        int dado;
        struct NO* prox;
    }NO;

    typedef struct FILA{
        NO* inicio;
        NO* fim;
    } FILA;

    FILA *f;

    void enfileira(int valor){
        NO* ptr = (NO *) malloc(sizeof(NO));
        ptr->dado = valor;
        ptr->prox = NULL;
        printf("%d", ptr->dado);
        if(f->inicio == NULL){
            f->inicio = ptr;
        }else{
            f->fim->prox = ptr;
            f->fim = ptr;
            
        }
        void imprimir(){
	        NO* ptr = f->inicio;
	
	        while(ptr != NULL){
		        printf("\n%d ", ptr->dado);
		        ptr = ptr->prox;
	        }
	
        }
        
        
    }
    
    

    int desenfileira(){
        NO* ptr = f->inicio;
        int dado;
        if(ptr != NULL){
            f->inicio = ptr->prox;
            ptr->prox = NULL;
            dado = ptr->dado;
            free(ptr);
            return dado;
        }
    }
    
    
    
    int main(){
        
        f = (FILA *) malloc(sizeof(FILA));
        f->inicio = NULL;
        f->fim = NULL;
        enfileira(10);
        enfileira(30);
        enfileira(50);
        desenfileira();
        enfileira(14);
        
    }
    
    

}

