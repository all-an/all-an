//g++ jogoadivinha.cpp -o jogoadivinha
//./jogoadivinha
// Simple C++ program to display "Hello World"

// Header file for input output functions
#include<iostream>

using namespace std;

// main function -
// where the execution of program begins
int main()
{
	setlocale(LC_ALL,"pt_BR.UTF-8");
	// prints hello world
	cout << "vvvvvvvvvvvvvvvvvvvvvvv" <<endl;
	cout << "| Jogo da Adivinha‡Æo |" <<endl;
	cout << "^^^^^^^^^^^^^^^^^^^^^^^" <<endl;

	const int NUMERO_SECRETO = 42;
	bool nao_acertou = true;

	while(nao_acertou){
		
		cout << "Chute um n£mero: ";
		int chute;
		cin >> chute;

		cout << "Chutou : " << chute << endl;

		bool acertou = (chute == NUMERO_SECRETO);
		bool maior = (chute > NUMERO_SECRETO);

		if(acertou){
			cout << "Parab‚ns, acertou !" << endl;
			nao_acertou = false;
		}else if(maior){
			cout << "Errou, chutou maior que o n£mero secreto !" << endl;
		}else{
			cout << "Errou, chutou menor que o n£mero secreto !" << endl;
		}
	}
	
	cout << "Fim !" << endl;
}
